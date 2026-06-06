/**
 * Arranges the rocket telemetry signals into a browsable OpenMCT folder tree: a
 * `Rocket Telemetry` root composing three directories (Link Quality, Send
 * Uplink, Ground Station Downlink), each a nested tree of folders and scalar
 * signal objects (provided by {@link DataProviderPlugin}).
 */
import { NAMESPACE } from './data-provider'
import { ROCKET_TREE } from '../sources/rocket-telemetry'
import type { TreeNode } from '../sources/rocket-telemetry'
import type { OpenMCT } from 'openmct'

export const ROCKET_NAMESPACE = 'rocket'
export const ROCKET_ROOT_KEY = 'telemetry'

type Identifier = { namespace: string; key: string }

/** Folder key for a given folder node id. */
function folderKey(id: string): string {
  return `folder.${id}`
}

/** Index every folder node in the tree by id, for O(1) provider lookups. */
const foldersById = new Map<string, Extract<TreeNode, { kind: 'folder' }>>()
/** Each folder id → its parent's `location` string (root or parent folder). */
const parentLocation = new Map<string, string>()
const ROOT_LOCATION = `${ROCKET_NAMESPACE}:${ROCKET_ROOT_KEY}`
;(function index(nodes: TreeNode[], location: string) {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      foldersById.set(node.id, node)
      parentLocation.set(node.id, location)
      index(node.children, `${ROCKET_NAMESPACE}:${folderKey(node.id)}`)
    }
  }
})(ROCKET_TREE, ROOT_LOCATION)

/** Composition reference for a child node: a signal leaf or a sub-folder. */
function childRef(node: TreeNode): Identifier {
  return node.kind === 'signal'
    ? { namespace: NAMESPACE, key: node.signal.key }
    : { namespace: ROCKET_NAMESPACE, key: folderKey(node.id) }
}

function rootFolder() {
  return {
    identifier: { namespace: ROCKET_NAMESPACE, key: ROCKET_ROOT_KEY },
    name: 'Rocket Telemetry',
    type: 'folder',
    location: 'ROOT',
    composition: ROCKET_TREE.map(childRef),
  }
}

function folderObject(id: string) {
  const node = foldersById.get(id)
  if (!node) return undefined
  return {
    identifier: { namespace: ROCKET_NAMESPACE, key: folderKey(id) },
    name: node.name,
    type: 'folder',
    location: parentLocation.get(id) ?? ROOT_LOCATION,
    composition: node.children.map(childRef),
  }
}

export function RocketTelemetryTreePlugin(openmct: OpenMCT) {
  openmct.objects.addRoot(
    { namespace: ROCKET_NAMESPACE, key: ROCKET_ROOT_KEY },
    openmct.priority.HIGH
  )

  openmct.objects.addProvider(ROCKET_NAMESPACE, {
    get(identifier: Identifier) {
      if (identifier.key === ROCKET_ROOT_KEY) {
        return Promise.resolve(rootFolder())
      }
      const prefix = 'folder.'
      if (identifier.key.startsWith(prefix)) {
        return Promise.resolve(folderObject(identifier.key.slice(prefix.length)))
      }
      return Promise.resolve(undefined)
    },
  })
}
