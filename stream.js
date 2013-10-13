var duplex = require('duplex')

function isString (s) {
  return 'string' === typeof s
}

function isObject (o) {
  return o && 'object' == typeof o
}

// eventually you get to a point where you
// know that seeing da39a3ee5e...
// means you have a bug.

var EMPTY = "da39a3ee5e6b4b0d3255bfef95601890afd80709"

// that is the hash of the empty string.

var isArray = Array.isArray
function isObject (o) {
  return o && 'object' === typeof o
}

function isLeaf(e) {
  return e.count === 1
}

function isBranch(e) {
  return e.count > 1
}

function isEmpty(e) {
  return !e || e.count === 0
}

module.exports = function (merkle) {

  // when a branch is exchanged,
  // if two subbranches are equal, that portion is in sync.
  // if you are missing a branch, wait for that digest.
  // if you have an extra branch, send that subbranch.
  // if a subbranch is not equal, expand that sub branch.

  // if you receive a leaf, that is not in a branch
  // (but you have a corrisponding branch)
  // send a request for that leaf.

  var d = duplex()

  d.waiting = {}

  d.send = function (hash, obj) {
    d._data({key: hash, value: obj})
  }

  d.receive = function (hash) {
    merkle.update(hash)
    // we need to know when the replication is complete,
    // if we are serious about comparing sets.
    var tree = merkle.get(hash)
    var pre = tree.pre, h
    do {
      if(h = d.waiting[pre]) {
        if(hash === merkle.subtree(pre).digest()) {
          delete d.waiting[pre]
          break;
        }
      }
      pre = pre.substring(0, pre.length - 1)
    } while(pre.length);

    for(var k in d.waiting)
      return

    //if there are no more waiting messages,
    //then emit sync!
    d.emit('sync', merkle.digest())
  }

  function compare (/*p, */h, e) {
    //this will only happen at root.
    if(isEmpty(h) && isEmpty(e)) {
      d.emit('branch_sync', e.prefix(), h.hash)
    }
    else if(isEmpty(h)) {
      if(!e.prefix) {
        console.log(e)
      }
      d.emit('send_branch', e)
    }
    else if(isEmpty(e)) {
      //do nothing, await branch

      d.emit('await_branch', e.prefix(), d.hash)
    }
    else if(isLeaf(h) && isLeaf(e)) {
      //leaves in sync
      if(h.hash === e.hash) {
        d.emit('branch_sync', e.prefix(), h.hash)
      } else
        //leaves out of sync, send my leaf
        d.emit('send_branch', e, h.hash /*exclude*/)
    }
    //compare their branch with my leaf
    else if(isBranch(h) && isLeaf(e)) {
       //do nothing, wait for other side to request the leaf
    }
    //compare two branches
    else if(isBranch(h) && isBranch(e)) {
      //branches in sync
      if(h.hash === e.digest())
        d.emit('branch_sync', e.prefix(), h.hash)
      else
        //send next layer.
        d._data([e.prefix(), e.expand()])
    }
    //compare their leaf with my branch
    else if(isLeaf(h) && isBranch(e)) {
      d.emit('send_branch', e, h.hash /*exclude*/)
      //if I don't have that leaf, request it.
      if(!e.has(h.hash))
        d._data([e.prefix() /*p*/, null])
    }
  }

  function onData(data) {
    //this occurs only on the top hash.
    if(isObject(data) && data.hash) {
      compare(data, merkle)
    }
    else if(isArray(data)) {
      var pre = data[0]
      var hashes = data[1]
      var tree = merkle.subtree(pre)

      //request for just one hash
      if(hashes === null) {
        //TODO: find out how often this happens?
        return d.emit('send_branch', tree)
      }

      if(!tree) //this should never happen
        throw new Error('missing tree requested')

      for(var k = 0; k < 16; k++){
        var e = tree.tree[k]
        if(!e) {
          d.emit('await_branch', pre + k, hashes[k.toString(16)])
        }
        else {
          var h = hashes[k.toString(16)]
          if(h) {
            //comparing two leaves
            compare(h, e)
          } else {
            //this branch will be in sync, once it's recieved on the other side.
            d.emit('send_branch', e)
          }
        }
      }
    } else if(data.key) {
      d.receive(data.key, data.value)
      d.emit('receive', data.key, data.value)
    }
  }

  d.on('await_branch', function (k, hash) {
    d.waiting[k] = hash
  })

  var queue = []
  var onQueue = queue.push.bind(queue)
  d.on('_data', onQueue)

  // and then stream the actual data somehow...
  // one easy way would just be to put the merkle tree inside
  // a mux-demux, and stream each object as a separate stream.
  // that would work well for replicating files, certainly.

  // otherwise, hmm, maybe just expose a send method on the stream?
  // so that other data can be sent?

  d._started = null

  d.start = function (s) {
    if(s === false) return d._started = false, d
    if(d._started) return d
    d._started = true

    while(queue.length)
      onData(queue.shift())

    d.removeListener('_data', onQueue)
    d.on('_data', onData)
    d._data({hash: merkle.digest(), count: merkle.count})
    return d
  }

  process.nextTick(function () {
    if(d._started !== false)
      d.start()
  })

  return d
}
