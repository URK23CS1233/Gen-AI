from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import whisper
import os
import subprocess
import json

from rag_index import RAGIndex
from groq import Groq

app = Flask(__name__)
CORS(app)

# Load Whisper model
whisper_model = whisper.load_model("base")

# MongoDB Atlas setup
mongo_uri = "mongodb+srv://Gen-AI:Let'sWin@cluster0.19htbvp.mongodb.net/"
client = MongoClient(mongo_uri)
db = client["Gen-AI"]
collection = db["transcript"]
responses_collection = db["Chatbot"]["responses_collection"]

# Groq setup
groq_client = Groq(api_key="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")

# Route: Transcribe audio and store results
@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    if 'file' not in request.files:
        return jsonify({"error": "No audio file received"}), 400

    audio_file = request.files['file']
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    temp_audio = os.path.join(upload_dir, "temp_audio.webm")
    audio_file.save(temp_audio)

    # Transcribe with Whisper
    result = whisper_model.transcribe(temp_audio)
    transcript = result["text"].strip()

    # Save transcript to file
    transcript_path = "transcript.txt"
    with open(transcript_path, "w", encoding="utf-8") as f:
        f.write(transcript)

    # Run summarizer
    proc = subprocess.run(["python", "summarize.py", transcript_path],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        return jsonify({"error": proc.stderr}), 500

    summary_data = eval(proc.stdout)

    # Save to MongoDB
    mongo_doc = {
        "transcript": transcript,
        "summary": summary_data.get("summary", ""),
        "notes": summary_data.get("notes", "")
    }
    inserted = collection.insert_one(mongo_doc)

    # Save a JSON for RAG
    with open("data/transcript.json", "w", encoding="utf-8") as f:
        json.dump(mongo_doc, f)

    return jsonify({"message": "Transcription and summary saved", "id": str(inserted.inserted_id)})

@app.route("/chatbot", methods=["POST"])
def ask_chatbot():
    try:
        data = request.get_json()
        query = data.get("query", "")

        # Setup RAG and get context
        rag = RAGIndex("data/transcript.json")
        rag.setup()
        context_list = rag.query(query)
        context = " ".join(context_list)

        # Groq API Call with updated model
        chat_completion = groq_client.chat.completions.create(
            model="llama3-70b-8192",  # ✅ Updated model
            messages=[
                {"role": "system", "content": "You are a helpful assistant that answers based on a transcript."},
                {"role": "user", "content": f"{context}\n\nQuestion: {query}"}
            ]
        )

        answer = chat_completion.choices[0].message.content

        # ✅ Save chatbot interaction to MongoDB
        responses_collection.insert_one({
            "query": query,
            "context": context,
            "response": answer
        })

        return jsonify({"response": answer})

    except Exception as e:
        return jsonify({"error": str(e)})


if __name__ == "__main__":
    app.run(debug=True)
