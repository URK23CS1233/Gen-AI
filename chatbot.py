from groq import Groq
from rag_index import RAGIndex
import os

GROQ_API_KEY = os.getenv("GROQ_API_KEY") or "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"
client = Groq(api_key=GROQ_API_KEY)

json_path = "data/transcript.json"

def ask_chatbot(query):
    try:
        rag = RAGIndex(json_path)
        rag.setup()
        context = rag.query(query, top_n=1)

        chat_completion = client.chat.completions.create(
            model="mixtral-8x7b-32768",
            messages=[
                {"role": "system", "content": "You are an assistant that answers based on a meeting transcript."},
                {"role": "user", "content": f"{context[0]}\n\nQuestion: {query}"}
            ]
        )

        return chat_completion.choices[0].message.content.strip()

    except FileNotFoundError:
        return "Transcript not found. Please upload and transcribe a file first."
    except Exception as e:
        return f"Error: {str(e)}"

# Optional: test interactively
if __name__ == "__main__":
    while True:
        user_input = input("Ask a question (or type 'exit'): ")
        if user_input.lower() == 'exit':
            break
        print(ask_chatbot(user_input))
