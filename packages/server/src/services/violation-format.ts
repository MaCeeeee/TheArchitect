// REQ-003.2: kanonische Wire-Form einer Violation (OPA/Kyverno-Stil).
// ViolationMessage lebt in SHARED (Task 1) — Client typisiert damit.
import { ViolationSeverity, EnforcementLevel, ViolationMessage } from '@thearchitect/shared';

export type { ViolationMessage };

export interface ViolationMessageInput {
  ruleId: string;
  severity: ViolationSeverity;
  enforcementLevel: EnforcementLevel;
  message: string;
  elementId: string;
  field: string;
  docLink?: string;
}

export function toViolationMessage(input: ViolationMessageInput): ViolationMessage {
  const msg: ViolationMessage = {
    ruleId: input.ruleId,
    severity: input.severity,
    enforcementLevel: input.enforcementLevel,
    message: input.message,
    // Assumes elementId/field contain no '/' (IDs are UUID/ObjectId-shaped), keeping the path 3 segments.
    resourcePath: `/elements/${input.elementId}/${input.field}`,
  };
  if (input.docLink) msg.docLink = input.docLink;
  return msg;
}
