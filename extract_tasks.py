# extract_tasks.py

from rag_index import RAGIndex
from groq import Groq

# Load transcript data
rag = RAGIndex("data/transcript.json")
rag.setup()

# Setup Groq API client
groq_client = Groq(api_key="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")

def extract_tasks():
    context = rag.search("List all tasks with their owners and deadlines")
    
    prompt = (
        "From the following meeting context, extract all tasks in this format:\n"
        "Task: <task>\nOwner: <person responsible>\nDeadline: <deadline or 'Not specified'>\n\n"
        "Meeting Context:\n" + "\n".join(context)
    )

    response = groq_client.chat.completions.create(
        model="mixtral-8x7b-32768",
        messages=[{"role": "user", "content": prompt}]
    )

    return response.choices[0].message.content.strip()

# To run directly and print tasks:
if __name__ == "__main__":
    print(extract_tasks())
