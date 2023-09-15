import { createGenerator } from '@unocss/core'
import presetUno from '@unocss/preset-uno'
import { describe, it } from 'vitest'
import { createAutocomplete, searchAttrKey, searchUsageBoundary } from '@unocss/autocomplete'

describe('autocomplete-in-file', () => {
  const uno = createGenerator({
    presets: [
      presetUno(),
    ],
  })

  const ac = createAutocomplete(uno)

  const fixture = `
  import { defineComponent } from "vue";
  
  export interface Series {
    name: string;
    data: number[];
  }
  
  export default defineComponent({
    props: {
      series: {
        type: Array as () => Series[],
        default: () => []
      }
    },
    setup(){
      return ()=>(
        <div bg="red" class="w-full"></div>
      )
    }
  });
`

  it('should suggestInFile', async () => {
    const length = fixture.length

    const set = new Set<string>()

    // get all hints and remove duplicates
    const hints = Array.from({ length }, (_, i) => i).map((i) => {
      const ub = searchUsageBoundary(fixture, i)
      const hint = ub.content
      if (hint && !set.has(hint)) {
        set.add(hint)
        return [hint, i] as const
      }
      return null
    }).filter(r => !!r) as [string, number][]

    // get all suggestions
    const list = await Promise.all(hints.map(async ([hint, i]) => {
      const attr = searchAttrKey(fixture, i)
      const rs = await ac.suggest(hint, attr !== undefined)
      if (rs.length)
        return [i, hint, attr]
      return null
    }))

    const filtered = list.filter(i => i !== null)
    // eslint-disable-next-line no-console
    console.log(filtered)
  })
})
