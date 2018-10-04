export function mergeMap(a: Map<any, any>, b: Map<any, any>) {
  const output = new Map()

  for (const key of Array.from(a.keys())) {
    output.set(key, a.get(key))
  }

  for (const key of Array.from(b.keys())) {
    const value = b.get(key)

    if (output.has(key)) {
      if (Array.isArray(output.get(key))) {
        if (Array.isArray(value)) {
          output.set(key, value.concat(output.get(key)))
        } else {
          const arr = output.get(key)
          arr.push(value)
          output.set(key, arr)
        }
      } else {
        if (Array.isArray(value)) {
          value.push(output.get(key))
          output.set(key, value)
        } else {
          output.set(key, Array.of(value, output.get(key)))
        }
      }
    } else {
      output.set(key, value)
    }
  }

  return output
}
