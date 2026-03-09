import type { ArchitectureElement, Connection } from '../stores/architectureStore';

interface BPMNElement {
  tagName: string;
  id: string;
  name?: string;
}

interface BPMNFlow {
  id: string;
  sourceRef: string;
  targetRef: string;
  name?: string;
}

const BPMN_TYPE_MAPPING: Record<string, { type: string; layer: ArchitectureElement['layer']; togafDomain: ArchitectureElement['togafDomain'] }> = {
  'bpmn:task': { type: 'process', layer: 'business', togafDomain: 'business' },
  'bpmn:userTask': { type: 'process', layer: 'business', togafDomain: 'business' },
  'bpmn:serviceTask': { type: 'application_service', layer: 'application', togafDomain: 'application' },
  'bpmn:sendTask': { type: 'business_service', layer: 'business', togafDomain: 'business' },
  'bpmn:receiveTask': { type: 'business_service', layer: 'business', togafDomain: 'business' },
  'bpmn:scriptTask': { type: 'application_component', layer: 'application', togafDomain: 'application' },
  'bpmn:subProcess': { type: 'process', layer: 'business', togafDomain: 'business' },
  'bpmn:dataStoreReference': { type: 'data_entity', layer: 'information', togafDomain: 'data' },
  'bpmn:dataObjectReference': { type: 'data_entity', layer: 'information', togafDomain: 'data' },
  'bpmn:startEvent': { type: 'business_service', layer: 'business', togafDomain: 'business' },
  'bpmn:endEvent': { type: 'business_service', layer: 'business', togafDomain: 'business' },
  'bpmn:intermediateThrowEvent': { type: 'business_service', layer: 'business', togafDomain: 'business' },
  'bpmn:intermediateCatchEvent': { type: 'business_service', layer: 'business', togafDomain: 'business' },
  'bpmn:exclusiveGateway': { type: 'process', layer: 'business', togafDomain: 'business' },
  'bpmn:parallelGateway': { type: 'process', layer: 'business', togafDomain: 'business' },
  'bpmn:inclusiveGateway': { type: 'process', layer: 'business', togafDomain: 'business' },
};

const LAYER_Y: Record<string, number> = {
  strategy: 12,
  business: 8,
  information: 4,
  application: 0,
  technology: -4,
};

function generateId(): string {
  return `bpmn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseBPMN(xmlString: string): { elements: ArchitectureElement[]; connections: Connection[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid BPMN XML: ' + parseError.textContent);
  }

  const bpmnElements: BPMNElement[] = [];
  const bpmnFlows: BPMNFlow[] = [];

  // Find the process element
  const processes = doc.querySelectorAll('process, bpmn\\:process, bpmn2\\:process');

  for (const process of processes) {
    for (const child of process.children) {
      const localName = child.localName || child.tagName;
      const fullTag = `bpmn:${localName}`;

      if (BPMN_TYPE_MAPPING[fullTag]) {
        bpmnElements.push({
          tagName: fullTag,
          id: child.getAttribute('id') || generateId(),
          name: child.getAttribute('name') || localName,
        });
      }

      if (localName === 'sequenceFlow') {
        const sourceRef = child.getAttribute('sourceRef');
        const targetRef = child.getAttribute('targetRef');
        if (sourceRef && targetRef) {
          bpmnFlows.push({
            id: child.getAttribute('id') || generateId(),
            sourceRef,
            targetRef,
            name: child.getAttribute('name') || undefined,
          });
        }
      }

      if (localName === 'dataStoreReference' || localName === 'dataObjectReference') {
        bpmnElements.push({
          tagName: `bpmn:${localName}`,
          id: child.getAttribute('id') || generateId(),
          name: child.getAttribute('name') || localName,
        });
      }
    }
  }

  // Also collect data associations
  const dataAssociations = doc.querySelectorAll(
    'dataInputAssociation, dataOutputAssociation, bpmn\\:dataInputAssociation, bpmn\\:dataOutputAssociation'
  );
  for (const assoc of dataAssociations) {
    const source = assoc.querySelector('sourceRef')?.textContent;
    const target = assoc.querySelector('targetRef')?.textContent;
    if (source && target) {
      bpmnFlows.push({
        id: generateId(),
        sourceRef: source,
        targetRef: target,
        name: 'data flow',
      });
    }
  }

  // Create ID mapping from BPMN IDs to our IDs
  const idMap = new Map<string, string>();
  const elements: ArchitectureElement[] = [];

  // Group elements by layer for positioning
  const layerCounts: Record<string, number> = {};

  for (const bpmnEl of bpmnElements) {
    const mapping = BPMN_TYPE_MAPPING[bpmnEl.tagName];
    if (!mapping) continue;

    const newId = generateId();
    idMap.set(bpmnEl.id, newId);

    const layer = mapping.layer;
    layerCounts[layer] = (layerCounts[layer] || 0);
    const col = layerCounts[layer];
    layerCounts[layer]++;

    const spacing = 3;
    const rowSize = 5;
    const x = (col % rowSize) * spacing - ((Math.min(rowSize, layerCounts[layer]) - 1) * spacing) / 2;
    const z = Math.floor(col / rowSize) * spacing;

    elements.push({
      id: newId,
      type: mapping.type,
      name: bpmnEl.name || 'Unnamed',
      description: `Imported from BPMN (${bpmnEl.tagName})`,
      layer,
      togafDomain: mapping.togafDomain,
      maturityLevel: 3,
      riskLevel: 'low',
      status: 'current',
      position3D: { x, y: LAYER_Y[layer] || 0, z },
      metadata: { bpmnId: bpmnEl.id, bpmnType: bpmnEl.tagName },
    });
  }

  const connections: Connection[] = [];
  for (const flow of bpmnFlows) {
    const sourceId = idMap.get(flow.sourceRef);
    const targetId = idMap.get(flow.targetRef);
    if (sourceId && targetId) {
      connections.push({
        id: generateId(),
        sourceId,
        targetId,
        type: flow.name === 'data flow' ? 'data_flow' : 'connects_to',
        label: flow.name || 'sequence',
      });
    }
  }

  return { elements, connections };
}
