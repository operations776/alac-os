-- Commenting on a task failed: "function task_audience(uuid, uuid) is not unique".
--
-- Mission Control migration 10 added a three argument task_audience with a
-- defaulted third parameter through create or replace, which does not replace
-- a function with a different signature. Both survived, so every two argument
-- call, the comment notification trigger among them, matched both and raised.
-- Carried over from the source schema, fixed here. The three argument version
-- answers every two argument call with the same result.

drop function if exists mc.task_audience(uuid, uuid);
