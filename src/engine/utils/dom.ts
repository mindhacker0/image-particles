/** DOM 辅助函数：查询字符串与偏移量。 */

/** 读取查询字符串中某个参数的值。 */
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

/** 解析后的查询字符串，仅在模块加载时求值一次。 */
export const QueryString: Record<string, string | string[]> = (() => {
  const queryString: Record<string, string | string[]> = {}
  const query = window.location.search.substring(1)
  const vars = query.split('&')

  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=')

    // 该名称的第一个值
    if (typeof queryString[pair[0]] === 'undefined') {
      queryString[pair[0]] = decodeURIComponent(pair[1])
      // 该名称的第二个值：转为数组
    } else if (typeof queryString[pair[0]] === 'string') {
      queryString[pair[0]] = [queryString[pair[0]] as string, decodeURIComponent(pair[1])]
      // 该名称的第三个及以后的值
    } else {
      ;(queryString[pair[0]] as string[]).push(decodeURIComponent(pair[1]))
    }
  }

  return queryString
})()

/** 计算元素相对页面左上角的偏移量。 */
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
