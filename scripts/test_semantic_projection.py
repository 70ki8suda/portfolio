import unittest,json,numpy as np
from semantic_projection import chunk_ranges,pool_chunks,make_reference,project,validate_reference
class ProjectionTests(unittest.TestCase):
 def test_token_intervals_cover_every_token_once(self):
  for n in [0,1,479,480,481,20001]:
   ranges=chunk_ranges(n);self.assertEqual([i for a,b in ranges for i in range(a,b)],list(range(n)));self.assertTrue(all(b-a<=480 for a,b in ranges))
 def test_tail_is_weighted_not_discarded(self):
  a=pool_chunks([[1,0],[0,1]],[480,1]);b=pool_chunks([[1,0],[0,-1]],[480,1]);self.assertGreater(a[1],0);self.assertLess(b[1],0);self.assertAlmostEqual(np.linalg.norm(a),1)
 def test_shared_mapping_batch_order_and_roundtrip(self):
  vectors=[[1,0],[0,1],[-1,0]];coords=[[0,0],[1,1],[2,0]];s=make_reference(vectors,coords,['a','b','c'],'recipe');s=json.loads(json.dumps(s));validate_reference(s,2)
  x=[[.8,.2],[1,0]];y=project(s,x);self.assertTrue(np.array_equal(y,project(s,x[::-1])[::-1]));self.assertTrue(np.array_equal(y,np.vstack([project(s,[r]) for r in x])));self.assertTrue(np.array_equal(y[1],[0,0]))
 def test_same_vector_never_has_two_coordinates(self):
  with self.assertRaises(ValueError):make_reference([[1,0],[1,0]],[[0,0],[1,1]],['a','b'],'recipe')
 def test_corruption_zero_norm_and_changed_input(self):
  s=make_reference([[1,0],[0,1]],[[0,0],[2,2]],['a','b'],'recipe');self.assertFalse(np.array_equal(project(s,[[1,0]]),project(s,[[.8,.2]])))
  bad=json.loads(json.dumps(s));bad['coordinates'][0][0]=1
  with self.assertRaises(ValueError):validate_reference(bad,2)
  with self.assertRaises(ValueError):project(s,[[0,0]])
  with self.assertRaises(ValueError):project(s,[[float('nan'),1]])
if __name__=='__main__':unittest.main()
