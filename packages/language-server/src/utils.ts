import path from 'node:path'
import type { UnoGenerator } from '@unocss/core'
import prettier from 'prettier/standalone'
import parserCSS from 'prettier/parser-postcss'

import type { Position, Range } from 'vscode-languageserver'

export function throttle<T extends ((...args: any) => any)>(func: T, timeFrame: number): T {
  let lastTime = 0
  let timer: any
  return function (...args) {
    const now = Date.now()
    clearTimeout(timer)
    if (now - lastTime >= timeFrame) {
      lastTime = now
      return func(...args)
    }
    else {
      timer = setTimeout(func, timeFrame, ...args)
    }
  } as T
}

export async function getCSS(uno: UnoGenerator, utilName: string) {
  const { css } = await uno.generate(utilName, { preflights: false, safelist: false })
  return css
}

/**
 *
 * Credit to [@voorjaar](https://github.com/voorjaar)
 * @see https://github.com/windicss/windicss-intellisense/issues/13
 * @param str
 * @returns
 */
export function addRemToPxComment(str?: string, remToPixel = 16) {
  if (!str)
    return ''
  if (remToPixel < 1)
    return str
  let index = 0
  const output: string[] = []

  while (index < str.length) {
    const rem = str.slice(index).match(/-?[\d.]+rem;/)
    if (!rem || !rem.index)
      break
    const px = ` /* ${Number.parseFloat(rem[0].slice(0, -4)) * remToPixel}px */`
    const end = index + rem.index + rem[0].length
    output.push(str.slice(index, end))
    output.push(px)
    index = end
  }
  output.push(str.slice(index))
  return output.join('')
}

export async function getPrettiedCSS(uno: UnoGenerator, util: string, remToPxRatio: number) {
  const result = (await uno.generate(util, { preflights: false, safelist: false }))
  const css = addRemToPxComment(result.css, remToPxRatio)
  const prettified = prettier.format(css, {
    parser: 'css',
    plugins: [parserCSS],
  })

  return {
    ...result,
    prettified,
  }
}

export async function getPrettiedMarkdown(uno: UnoGenerator, util: string, remToPxRatio: number) {
  return `\`\`\`css\n${(await getPrettiedCSS(uno, util, remToPxRatio)).prettified}\n\`\`\``
}

export function getMarkdownCodeBlock(code: string, lang = 'css') {
  return `\`\`\`${lang}\n${code}\n\`\`\``
}

function getCssVariables(code: string) {
  const regex = /(?<key>--\S+?):\s*(?<value>.+?)\s*[!;]/gm
  const cssVariables = new Map<string, string>()
  for (const match of code.matchAll(regex)) {
    const key = match.groups?.key
    if (key)
      cssVariables.set(key, match.groups?.value ?? '')
  }

  return cssVariables
}

const matchCssVarNameRegex = /var\((?<cssVarName>--[^,|)]+)(?:,\s*(?<fallback>[^)]+))?\)/gm
const cssColorRegex = /(?:#|0x)(?:[a-f0-9]{3}|[a-f0-9]{6})\b|(?:rgb|hsl)a?\(.*\)/gm

/**
 * Get CSS color string from CSS string
 *
 * @example Input with CSS var
 * ```css
 *.dark [border="dark\:gray-700"] {
 *  --un-border-opacity: 1;
 *  border-color: rgba(55, 65, 81, var(--un-border-opacity));
 *}
 * ```
 * return `rgba(55, 65, 81, 1)`
 *
 * @example Input with no-value CSS var and its fallback value
 * ```css
 *.bg-brand-primary {
 *  background-color: hsla(217, 78%, 51%, var(--no-value, 0.5));
 *}
 * ```
 * return `hsla(217, 78%, 51%, 0.5)`
 *
 * @example Input with no-value CSS var
 * ```css
 *.bg-brand-primary {
 *  background-color: hsla(217, 78%, 51%, var(--no-value));
 *}
 * ```
 * return `hsla(217, 78%, 51%)`
 *
 * @param str - CSS string
 * @returns The **first** CSS color string (hex, rgb[a], hsl[a]) or `undefined`
 */
export function getColorString(str: string) {
  let colorString = str.match(cssColorRegex)?.[0] // e.g rgba(248, 113, 113, var(--maybe-css-var))

  if (!colorString)
    return

  const cssVars = getCssVariables(str)

  // replace `var(...)` with its value
  for (const match of colorString.matchAll(matchCssVarNameRegex)) {
    const matchedString = match[0]
    const cssVarName = match.groups?.cssVarName
    const fallback = match.groups?.fallback

    if (cssVarName && cssVars.get(cssVarName))
      // rgba(248, 113, 113, var(--un-text-opacity)) => rgba(248, 113, 113, 1)
      colorString = colorString.replaceAll(matchedString, cssVars.get(cssVarName) ?? matchedString)
    else if (fallback)
      // rgba(248, 113, 113, var(--no-value, 0.5)) => rgba(248, 113, 113, 0.5)
      colorString = colorString.replaceAll(matchedString, fallback)

    // rgba(248, 113, 113, var(--no-value)) => rgba(248, 113, 113)
    colorString = colorString.replaceAll(/,?\s+var\(--.*?\)/gm, '')
  }

  // if (!(new TinyColor(colorString).isValid))
  //   return

  return colorString
}

export function isSubdir(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function isFulfilled<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === 'fulfilled'
}

export function isRejected(result: PromiseSettledResult<unknown>): result is PromiseRejectedResult {
  return result.status === 'rejected'
}

export function getValue<Default = any>(obj: Record<string, any>, path: string, defaultValue: Default) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? defaultValue
}

export function isWithinRange(position: Position, range: Range): boolean {
  if (position.line === range.start.line && position.character >= range.start.character)
    return position.line !== range.end.line || position.character < range.end.character
  if (position.line === range.end.line && position.character <= range.end.character)
    return position.line !== range.start.line || position.character > range.start.character

  return position.line > range.start.line && position.line < range.end.line
}
