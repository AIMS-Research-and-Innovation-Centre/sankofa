"""Curator — extracts concepts from a thesis. Offline-first."""
from __future__ import annotations
import re
from collections import Counter

_STOPWORDS = {
    "the","a","an","and","or","but","if","then","that","this","these","those",
    "is","are","was","were","be","been","being","of","in","on","at","to","for",
    "with","by","from","as","it","its","we","our","you","your","they","their",
    "can","could","should","would","may","might","will","not","no","so","such",
    "which","who","what","when","where","why","how","all","any","both","each",
    "few","more","most","other","some","only","own","same","too","very","just",
    "also","into","over","under","between","through","during","before","after",
}

_DOMAIN_BOOST = {
    "epidemiology","stochastic","sir","seir","malaria","hiv","tb","climate",
    "rainfall","monsoon","topology","manifold","graph","network","neural",
    "bayesian","markov","monte","carlo","regression","classification",
    "clustering","optimization","pde","ode","sde","fourier","wavelet","signal",
    "image","segmentation","cryptography","algebra","geometry","statistics",
    "probability","inference","estimation","forecasting","prediction",
}

_WORD = re.compile(r"[A-Za-z][A-Za-z\-]{2,}")


class Curator:
    name = "curator"

    def extract_concepts(self, text: str, top_k: int = 12) -> list[str]:
        text = text or ""
        words = [w.lower() for w in _WORD.findall(text)]
        words = [w for w in words if w not in _STOPWORDS and len(w) > 2]

        counts: Counter[str] = Counter(words)
        for w in list(counts):
            if w in _DOMAIN_BOOST:
                counts[w] *= 3

        return [term for term, _ in counts.most_common(top_k)]
