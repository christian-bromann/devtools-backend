export class ObjectStore {
    constructor () {
        this.objects = []
    }

    get (id) {
        const object = this.objects[id]

        if (!object) {
            return
        }

        return object
    }

    get size () {
        return this.objects.length
    }

    getByObjectId (objectId) {
        const id = JSON.parse(objectId).id
        return this.get(id)
    }

    getLastObject () {
        return this.get(this.getLastScriptId())
    }

    getLastScriptId () {
        return this.size - 1
    }

    push (object) {
        const id = this.size
        this.objects.push(object)
        return id
    }
}

export default new ObjectStore()
