"""Streamlit app for the BlackRoad Prism Generator with GPT and voice input."""

import io
import os
import tempfile

import matplotlib.pyplot as plt
import numpy as np
import streamlit as st
import whisper
from streamlit.runtime.uploaded_file_manager import UploadedFile

from prism_utils import parse_numeric_prefix
from tools.llm import _openai_chat_messages

st.set_page_config(layout="wide")
st.title("BlackRoad Prism Generator with GPT + Voice Console")

# Configure OpenAI
_api_key = os.getenv("OPENAI_API_KEY")
if not _api_key:
    st.warning("OpenAI API key not set. Set OPENAI_API_KEY to enable responses.")


@st.cache_resource
def get_whisper_model():
    """Load and cache the Whisper model."""
    return whisper.load_model("base")


def transcribe_audio(uploaded_file: UploadedFile) -> str:
    """Transcribe an uploaded audio file using Whisper."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(uploaded_file.read())
        tmp_path = tmp.name
    try:
        model = get_whisper_model()
        result = model.transcribe(tmp_path)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    return result["text"]


# Initialize chat history
if "chat_history" not in st.session_state:
    st.session_state.chat_history = [
        {
            "role": "system",
            "content": (
                "You are the BlackRoad Venture Console AI, a holographic assistant that replies "
                "with scientific and symbolic insights."
            ),
        }
    ]

st.markdown(
    "#### Speak or type an idea, formula, or question. The AI will respond and project a hologram:"
)

audio_file = st.file_uploader("Upload your voice (mp3 or wav)", type=["mp3", "wav"])
if audio_file is not None:
    user_input = transcribe_audio(audio_file)
    st.markdown(f"**You said:** {user_input}")
else:
    user_input = st.text_input("Or type here")

if user_input:
    if not _api_key:
        st.error("OpenAI API key not set.")
    else:
        st.session_state.chat_history.append({"role": "user", "content": user_input})
        try:
            assistant_reply = _openai_chat_messages(
                st.session_state.chat_history,
                model="gpt-4o-mini",
            )
        except Exception as exc:  # pragma: no cover - UI feedback path
            st.error(f"Failed to contact OpenAI: {exc}")
        else:
            st.session_state.chat_history.append({"role": "assistant", "content": assistant_reply})
            st.markdown(f"**Venture Console AI:** {assistant_reply}")

        magnitude = parse_numeric_prefix(user_input)
        fig = plt.figure(figsize=(6, 4))
        ax = fig.add_subplot(111, projection="3d")
        x = np.linspace(-5, 5, 100)
        y = np.linspace(-5, 5, 100)
        x, y = np.meshgrid(x, y)
        z = np.sin(np.sqrt(x**2 + y**2)) * magnitude
        ax.plot_surface(x, y, z, cmap="plasma")
        ax.axis("off")

        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        buf.seek(0)
        st.image(buf)
        plt.close(fig)

st.markdown("---")
st.markdown("**BlackRoad Prism Console** | Live UI Simulation")
st.image("72BF9767-A2EE-4CB6-93F4-4D738108BC4B.png", caption="Live Console Interface")
