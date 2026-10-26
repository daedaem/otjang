// Call after JSON syntax validation. Inspect member names, not JSON text inside a raw string.
export function hasDuplicateJsonMembers(text) {
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i++;
      for (; i < text.length; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === '"') break;
      }
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next])) next++;
      if (text[next] === ":") {
        const names = stack[stack.length - 1],
          key = JSON.parse(text.slice(start, i + 1));
        if (names?.has(key)) return true;
        names?.add(key);
      }
    } else if (c === "{") stack.push(new Set());
    else if (c === "[") stack.push(null);
    else if (c === "}" || c === "]") stack.pop();
  }
  return false;
}
