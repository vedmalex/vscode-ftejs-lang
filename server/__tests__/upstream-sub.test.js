const { SUB } = require('../out/parser.js')

describe('SUB Function Tests (upstream)', () => {
  test('should extract substring from buffer', () => {
    const buffer = 'Hello, World!'
    expect(SUB(buffer, 'Hello', 0)).toBe('Hello')
    expect(SUB(buffer, 'World', 7)).toBe('World')
  })

  test('should return empty string if position is out of bounds', () => {
    const buffer = 'Hello'
    expect(SUB(buffer, 'Hello', 6)).toBe('')
  })

  test('should return empty string if requested length exceeds buffer', () => {
    const buffer = 'Hello'
    expect(SUB(buffer, 'HelloWorld', 0)).toBe('')
  })

  test('should work with custom size parameter', () => {
    const buffer = 'Hello, World!'
    expect(SUB(buffer, 'Hello', 0, 5)).toBe('Hello')
    expect(SUB(buffer, 'World', 7, 12)).toBe('World')
  })

  test('should handle empty strings', () => {
    const buffer = ''
    expect(SUB(buffer, 'test', 0)).toBe('')
  })

  test('should handle unicode characters', () => {
    const buffer = 'Hello, 世界!'
    expect(SUB(buffer, '世界', 7)).toBe('世界')
  })
})
