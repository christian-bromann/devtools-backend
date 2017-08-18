import { hasGzipEncoding } from '../lib/utils'

test('can detect gzip files', () => {
    expect(hasGzipEncoding({ headers: {} })).toBe(false)
    expect(hasGzipEncoding({ headers: {'accept-encoding': false} })).toBe(false)
    expect(hasGzipEncoding({ headers: {'accept-encoding': 'none'} })).toBe(false)
    expect(hasGzipEncoding({ headers: {'accept-encoding': 'somegzip'} })).toBe(true)
})
