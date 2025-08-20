USE workflow_markup;
ALTER TABLE Flow
  ADD COLUMN parentFlowId INT NULL AFTER eventId,
  ADD CONSTRAINT fk_flow_parent FOREIGN KEY (parentFlowId) REFERENCES Flow(id) ON DELETE CASCADE,
  ADD INDEX idx_flow_parent (parentFlowId);
