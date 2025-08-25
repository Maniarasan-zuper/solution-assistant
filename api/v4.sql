ALTER TABLE Flow ADD COLUMN sortOrder INT NOT NULL DEFAULT 0;

-- Initialize sortOrder per (eventId, parentFlowId) using id order
SET @grp_event := -1; SET @grp_parent := -1; SET @rn := -1;
UPDATE Flow f
JOIN (
  SELECT id, eventId, COALESCE(parentFlowId,0) AS p, 
         ROW_NUMBER() OVER (PARTITION BY eventId, COALESCE(parentFlowId,0) ORDER BY id) - 1 AS rn
  FROM Flow
) x ON x.id = f.id
SET f.sortOrder = x.rn;

-- 1) Add an ordering column for sibling flows
ALTER TABLE Flow ADD COLUMN sortOrder INT NOT NULL DEFAULT 0;

-- 2) Initialize it per (eventId, parentFlowId) using current order (by name, then id)
-- Requires MySQL 8+ (ROW_NUMBER). If you’re on 5.7, tell me and I’ll give a fallback script.
UPDATE Flow f
JOIN (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY eventId, COALESCE(parentFlowId, 0)
      ORDER BY name, id
    ) - 1 AS rn
  FROM Flow
) x ON x.id = f.id
SET f.sortOrder = x.rn;

-- 3) Optional but recommended: index to speed reads
CREATE INDEX idx_flow_event_parent_order ON Flow (eventId, parentFlowId, sortOrder, id);
