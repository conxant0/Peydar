# Improvement notes

Ideas to revisit after the MVP has real discovery results. These are observations, not requirements for the current milestone.

## Query preview

- The first interest anchors most queries. A different anchor, or pairing interests with each other, may find papers this rule misses. Review actual Semantic Scholar results before changing it.
- The question's final prepositional phrase and the description's opening clause are simple heuristics. They can miss the most useful terms in other writing styles. Compare previews with useful papers from several topics before refining phrase selection.
- Interests entered as one comma-separated line are treated as one interest; the form expects one per line. If this keeps causing confusion, make the input guidance clearer or accept comma-separated entries.
- The eight-query cap keeps discovery bounded. Revisit the cap only if real searches consistently miss useful candidates.

For the MVP, keep the current deterministic rule and let the user review queries before discovery.
