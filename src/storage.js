export function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // Storage can be unavailable (private mode, disabled cookies).
  }
}
