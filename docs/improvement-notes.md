# Improvement notes

Ideas to revisit after the MVP has real discovery results. These are observations, not requirements for the current milestone.

## Query preview

- The first interest anchors most queries. A different anchor, or pairing interests with each other, may find papers this rule misses. Review actual Semantic Scholar results before changing it.
- The question's final prepositional phrase and the description's opening clause are simple heuristics. They can miss the most useful terms in other writing styles. Compare previews with useful papers from several topics before refining phrase selection.
- Separate boxes make entries clearer, but previously saved comma-separated interests remain one phrase until edited. If users still paste comma lists into one box, consider splitting on paste or explaining the error in the form.
- The eight-query cap keeps discovery bounded. Revisit the cap only if real searches consistently miss useful candidates.

For the MVP, keep the current deterministic rule and let the user review queries before discovery.
