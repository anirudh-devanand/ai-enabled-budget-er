from app.enrichment.embeddings import cosine_similarity, embed_text, token_overlap
from app.enrichment.normalize import normalize_descriptor


def test_similar_descriptors_score_high():
    a = embed_text("TIM HORTONS TORONTO")
    b = embed_text("TIM HORTONS CALGARY")
    c = embed_text("NETFLIX DOT COM")
    assert cosine_similarity(a, b) > 0.65
    assert cosine_similarity(a, c) < 0.55


def test_token_overlap_matches_shared_merchant_words():
    a = normalize_descriptor("BLUE BOTTLE ROASTERS #441 VAN")
    b = normalize_descriptor("BLUE BOTTLE COFFEE TORONTO ON")
    assert token_overlap(a, b) >= 0.4


def test_embedding_is_unit_length():
    vec = embed_text("LOBLAWS SUPERMARKET")
    assert abs(sum(v * v for v in vec) - 1.0) < 1e-6


def test_empty_still_embeds():
    assert len(embed_text("")) == 256
