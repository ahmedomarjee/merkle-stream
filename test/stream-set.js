
var Set = require('./set')
var tape = require('tape')
var u = require('../util')

tape('stream-set, small', function (t) {
  var s = Set()
  var z = Set()
  for(var i = 0; i < 16; i++)
    s.add(i), z.add(i)
  for(var i = 0; i < 4; i++)
    s.add(2 * i + 16), z.add(2 * i + 17)

  console.log('S', JSON.stringify(s.tree.toJSON(), null, 2))
  console.log('Z', JSON.stringify(z.tree.toJSON(), null, 2))

    var ss = s.createStream()
    var zs = z.createStream()
    ss.pipe(zs).pipe(ss)
    ss.resume(); zs.resume()
    console.log(s.tree.digest(), z.tree.digest())

    t.deepEqual(s.tree.leaves(), z.tree.leaves())
    t.equal(s.tree.digest(), z.tree.digest())
    t.end()
})

