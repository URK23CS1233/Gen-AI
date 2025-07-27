import sys
import json
from nltk.tokenize import sent_tokenize
from transformers import pipeline

def chunk_text(text, max_words=500):
    sentences = sent_tokenize(text)
    chunks, current_chunk, current_length = [], [], 0
    for sentence in sentences:
        words = sentence.split()
        if current_length + len(words) <= max_words:
            current_chunk.append(sentence)
            current_length += len(words)
        else:
            chunks.append(" ".join(current_chunk))
            current_chunk, current_length = [sentence], len(words)
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks

def summarize(transcript_path):
    with open(transcript_path, "r", encoding="utf-8") as f:
        text = f.read()

    summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
    chunks = chunk_text(text)
    summary = " ".join(
        summarizer(chunk, max_length=130, min_length=30, do_sample=False)[0]["summary_text"]
        for chunk in chunks
    )

    notes = [s for s in sent_tokenize(text) if len(s.split()) > 6][:10]
    bullet_points = ["• " + n.strip() for n in notes]

    # ✅ Proper JSON output
    result = {
        "summary": summary,
        "notes": bullet_points
    }
    print(json.dumps(result))  # Use json.dumps

if __name__ == "__main__":
    summarize(sys.argv[1])
