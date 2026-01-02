# Local Embedding Pipeline Research

## Current State

The application currently uses keyword-based scoring for evidence ranking (`src/lib/evidence.ts`). This works well for clinical documentation because medical terminology is distinctive and keyword overlap strongly correlates with semantic relevance.

## Research Question

Would vector embeddings improve evidence ranking? And if so, can they run locally to preserve the privacy architecture?

## Options Evaluated

### 1. OpenAI Embeddings API

**Pros:**
- High quality (text-embedding-3-small, 1536 dimensions)
- Simple API integration
- No local compute requirements

**Cons:**
- Breaks local-first architecture (data sent to OpenAI)
- Additional API costs (~$0.02 per 1M tokens)
- Adds latency for embedding generation

**Verdict:** Not recommended. Contradicts the privacy advantages of local parsing.

### 2. Browser-Based (Transformers.js)

**Pros:**
- Runs entirely in browser via WebAssembly
- No server required
- Models like `all-MiniLM-L6-v2` available (384 dimensions)

**Cons:**
- Initial model download (~23MB for MiniLM)
- First-inference latency (~2-3 seconds)
- Limited to smaller models

**Verdict:** Promising. Worth prototyping. Model caching via IndexedDB would mitigate download time.

### 3. Tauri/Rust Backend (Candle or ONNX)

**Pros:**
- Native performance
- Access to larger models (gte-base: 768 dimensions)
- One-time bundling with app

**Cons:**
- Increases app bundle size (~100-150MB)
- Platform-specific builds needed
- More complex development

**Verdict:** Best quality, but significant engineering overhead.

### 4. Hybrid Approach

**Architecture:**
1. Use keyword scoring as primary method (current)
2. Add optional embeddings for users with local compute
3. Toggle in settings: "Use semantic search (requires model download)"

**Implementation path:**
1. Start with Transformers.js for browser-native approach
2. Use `all-MiniLM-L6-v2` or similar small model
3. Cache model in IndexedDB after first download
4. Fall back to keyword scoring if model unavailable

## Clinical Domain Considerations

For psychiatric documentation, we should evaluate:

1. **Medical terminology handling**: Do general-purpose embeddings understand clinical abbreviations (SI, HI, MSE, etc.)?
2. **DSM-5 criteria matching**: Can embeddings connect "feeling down most of the day" to "A1 depressed mood"?
3. **Negation sensitivity**: Does the embedding distinguish "denies SI" from "endorses SI"?

Preliminary research suggests fine-tuned clinical embeddings (like PubMedBERT) outperform general models on medical text by 15-20%. However, these are larger and require more compute.

## Recommendation

**Phase 1 (Current):** Continue with keyword-based scoring. It's fast, private, and works well for clinical text.

**Phase 2 (Future):** Prototype Transformers.js integration with the following:
- `all-MiniLM-L6-v2` model (balanced size/quality)
- Optional toggle in settings
- IndexedDB model caching
- Benchmark against keyword scoring on clinical cases

**Phase 3 (Optional):** Evaluate Tauri/ONNX if Phase 2 shows significant quality gains.

## Benchmark Plan

To evaluate embedding quality vs. keyword scoring:

1. Create gold-standard test set: 20 clinical questions with manually identified relevant chunks
2. Run both methods on same corpus
3. Measure recall@10 (percentage of relevant chunks in top 10 results)
4. Compare latency and resource usage

Current keyword scoring achieves ~85% recall@10 on informal testing. Embeddings would need to exceed this to justify complexity.

## Files to Modify

If implementing embeddings:

- `src/lib/evidence.ts` - Add embedding-based ranking option
- `src/lib/types.ts` - Add settings for embedding toggle
- `src/components/SettingsModal.tsx` - Add UI toggle
- New: `src/lib/embeddings.ts` - Transformers.js integration

## Bundle Size Impact

| Approach | Bundle Size Delta |
|----------|-------------------|
| Transformers.js (lazy load) | +50KB (core), 23MB model (downloaded) |
| Tauri/ONNX | +100-150MB bundled |
| Keyword only (current) | 0 |

## Conclusion

Embeddings could improve ranking quality, especially for semantic queries. However, the current keyword-based approach is well-suited to clinical documentation where terminology is distinctive. 

Recommend monitoring user feedback on evidence relevance before investing in embedding infrastructure. If users report missing relevant evidence, prioritize Phase 2 prototyping.

