-- What the candidate actually said on the call.
--
-- "Is there a way of adding the transcription from the call that I'm having
-- with these candidates in here?" Adrian, 10 September. He runs a screening
-- call, and everything that makes the candidate sellable is said on it:
-- what they will move for, what they will not, the programmes they worked,
-- the reason they are looking.
--
-- Kept apart from `summary` on purpose. The summary is the pitch, written to
-- be read by a client; the transcript is raw evidence, written by nobody.
-- Merging them would mean either the pitch fills with filler or the evidence
-- gets edited until it is no longer what was said.
--
-- Not indexed for search yet: the matcher reads summary and domains, and a
-- transcript is long, noisy and would drown both. When it earns a place in
-- matching it gets its own tsvector rather than being appended to a field
-- that means something else.
alter table candidates
  add column if not exists transcript    text,
  add column if not exists transcript_at timestamptz;

comment on column candidates.transcript is
  'Raw notes or transcript from the screening call. Evidence, not the pitch.';
