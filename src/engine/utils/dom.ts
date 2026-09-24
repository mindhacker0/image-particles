/**
 * Ported from `js/utils/dom_utils.js` (query string and offset helpers).
 */

export function getQueryParams(param: string): string | undefined {
  const qs = document.location.search.split('+').join(' ')
  const params: Record<string, string> = {}
  let tokens: RegExpExecArray | null
  const re = /[?&]?([^=]+)=([^&]*)/g

  while ((tokens = re.exec(qs))) {
    params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2])
  }

  return params[param]
}

/** Parsed query string, evaluated once like the original IIFE did. */
export const QueryString: Record<string, string | string[]> = (() => {
  const queryString: Record<string, string | string[]> = {}
  const query = window.location.search.substring(1)
  const vars = query.split('&')

  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=')

    // If first entry with this name
    if (typeof queryString[pair[0]] === 'undefined') {
      queryString[pair[0]] = decodeURIComponent(pair[1])
      // If second entry with this name
    } else if (typeof queryString[pair[0]] === 'string') {
      queryString[pair[0]] = [queryString[pair[0]] as string, decodeURIComponent(pair[1])]
      // If third or later entry with this name
    } else {
      ;(queryString[pair[0]] as string[]).push(decodeURIComponent(pair[1]))
    }
  }

  return queryString
})()

export function getOffset(el: HTMLElement): { top: number; left: number } {
  let _x = 0
  let _y = 0
  let current: HTMLElement | null = el

  while (current && !isNaN(current.offsetLeft) && !isNaN(current.offsetTop)) {
    _x += current.offsetLeft - current.scrollLeft
    _y += current.offsetTop - current.scrollTop
    current = current.offsetParent as HTMLElement | null
  }

  return { top: _y, left: _x }
}
