export default class BitField {
    constructor (value) {
        this.values = [value]
    }

    get (i) {
        var index = (i / 32) | 0 // | 0 converts to an int. Math.floor works too.
        var bit = i % 32
        return (this.values[index] & (1 << bit)) !== 0
    }

    set (i) {
        var index = (i / 32) | 0
        var bit = i % 32
        this.values[index] |= 1 << bit
    }

    unset (i) {
        var index = (i / 32) | 0
        var bit = i % 32
        this.values[index] &= ~(1 << bit)
    }
}
