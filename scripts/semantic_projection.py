"""Frozen reference interpolation. No fit, force layout, or corpus-dependent transform."""
import hashlib
import numpy as np

INTERPOLATION = 'cosine-knn8-inverse4-eps1e-6-vector7-coordinate7-v1'

def chunk_ranges(total, size=480):
    if total < 0 or size < 1:
        raise ValueError('Invalid token count')
    return [(i, min(total, i + size)) for i in range(0, total, size)] or [(0, 0)]

def normalized(matrix):
    a = np.asarray(matrix, dtype=np.float64)
    if a.ndim != 2 or not np.isfinite(a).all():
        raise ValueError('Invalid vector matrix')
    norms = np.linalg.norm(a, axis=1)
    if (norms < 1e-12).any():
        raise ValueError('Zero norm vector')
    return a / norms[:, None]

def pool_chunks(vectors, lengths):
    if len(vectors) != len(lengths) or not vectors or any(n < 0 for n in lengths):
        raise ValueError('Invalid chunks')
    vector = np.average(normalized(vectors), axis=0, weights=[max(1,n) for n in lengths])
    return normalized([vector])[0]

def vector_key(row):
    return ','.join(f'{float(x):.7f}' if abs(float(x)) >= .00000005 else '0.0000000' for x in row)

def reference_id(state):
    # Fixed decimal wire representation is also reproducible by the TS validator.
    text = state['recipe'] + '\n' + INTERPOLATION + '\n' + '\n'.join(
        i + '|' + vector_key(v) + '|' + vector_key(p)
        for i,v,p in zip(state['ids'],state['vectors'],state['coordinates']))
    return hashlib.sha256(text.encode()).hexdigest()

def make_reference(vectors, coordinates, ids, recipe):
    a = np.asarray(vectors,dtype=np.float64).round(7); p = np.asarray(coordinates,dtype=np.float64).round(7)
    normalized(a)
    if p.shape != (len(a),2) or not np.isfinite(p).all() or len(ids)!=len(a) or len(set(ids))!=len(ids):
        raise ValueError('Invalid reference coverage')
    if len({vector_key(v) for v in a}) != len(a):
        raise ValueError('Deduplicate identical vectors before fit')
    order = sorted(range(len(ids)),key=lambda i:ids[i])
    state = dict(recipe=recipe,interpolation=INTERPOLATION,ids=[ids[i] for i in order],vectors=a[order].tolist(),coordinates=p[order].tolist())
    state['id']=reference_id(state)
    return state

def validate_reference(state, dimension):
    if state.get('interpolation') != INTERPOLATION or not isinstance(state.get('recipe'),str):
        raise ValueError('Incompatible reference recipe; explicit refresh required')
    rebuilt=make_reference(state['vectors'],state['coordinates'],state['ids'],state['recipe'])
    if np.asarray(state['vectors']).shape[1]!=dimension or rebuilt!=state:
        raise ValueError('Corrupt reference; explicit refresh required')

def project(state, vectors):
    validate_reference(state,len(state['vectors'][0]))
    rows=np.asarray(vectors,dtype=np.float64).round(7); unit=normalized(rows)
    ref=normalized(state['vectors']); coordinates=np.asarray(state['coordinates'])
    exact={vector_key(v):i for i,v in enumerate(state['vectors'])}
    result=[]
    for raw,row in zip(rows,unit):
        key=vector_key(raw)
        if key in exact:
            result.append(coordinates[exact[key]])
            continue
        distances=np.maximum(0,1-ref@row)
        nearest=np.argsort(distances,kind='stable')[:8]
        weights=1/(distances[nearest]+1e-6)**4
        result.append(np.average(coordinates[nearest],axis=0,weights=weights).round(7))
    return np.array(result)
