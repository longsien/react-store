import { circularDeepEqual } from 'fast-equals'

// Use circularDeepEqual to handle both circular and non-circular objects
// Performance testing showed this is faster than detecting circular refs first
export default circularDeepEqual
