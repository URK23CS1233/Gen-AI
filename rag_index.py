import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import os

class RAGIndex:
    def __init__(self, json_path):
        self.json_path = json_path
        self.documents = []
        self.vectorizer = TfidfVectorizer()
        self.tfidf_matrix = None

    def setup(self):
        if not os.path.exists(self.json_path):
            raise FileNotFoundError(f"{self.json_path} not found")

        with open(self.json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, list):
            self.documents = []
            for d in data:
                transcript = d.get("transcript", "")
                summary = d.get("summary", "")
                notes = d.get("notes", "")
                combined = " ".join([str(transcript), str(summary), str(notes)])
                self.documents.append(combined)
        else:
            transcript = data.get("transcript", "")
            summary = data.get("summary", "")
            notes = data.get("notes", "")
            combined = " ".join([str(transcript), str(summary), str(notes)])
            self.documents = [combined]

        self.tfidf_matrix = self.vectorizer.fit_transform(self.documents)

    def query(self, query, top_n=1):
        if self.tfidf_matrix is None:
            raise ValueError("TF-IDF matrix is not initialized. Call setup() first.")

        query_vec = self.vectorizer.transform([query])
        similarities = cosine_similarity(query_vec, self.tfidf_matrix).flatten()
        top_indices = similarities.argsort()[::-1][:top_n]

        # Always return a string (not a list)
        top_docs = [self.documents[i] for i in top_indices]
        return "\n\n".join(top_docs)

    def search(self, query):
        return self.query(query, top_n=3)
