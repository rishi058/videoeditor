import os
import re
import json
import time
import gc
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import whisperx
from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate

import warnings
warnings.filterwarnings("ignore")

# Global Constants
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16"   # Use int8 for faster inference with minimal quality loss, especially on large models. Switch to "float16" if you want slightly better accuracy and have enough VRAM.
MODEL_NAME = "large-v3-turbo" if DEVICE == "cuda" else "medium"
LANGUAGE = "en"

def devanagari_to_latin(text: str) -> str:
    """Converts Devanagari Hindi script to English alphabets."""
    romanized = transliterate(text, sanscript.DEVANAGARI, sanscript.ITRANS)
    # Lowercase the output (ITRANS capitalizes long vowels like 'A' or 'I')
    return romanized.lower()

app = FastAPI(
    title="Lyrics Synchronization Service",
    description="API for synchronizing lyrics with media files using OpenAI's WhisperX model.",
)

# Allow CORS from the Remotion dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

class SyncLyricsRequest(BaseModel):
    media_path: str
    output_path: str
    lyrics: str = ""
    force_alignment: bool = False
    devanagari_output: bool = True   # less overhead by default

@app.post("/sync-lyrics")
async def sync_lyrics(request: SyncLyricsRequest):
    print(f"[{time.strftime('%X')}] Using device: {DEVICE.upper()} (Compute: {COMPUTE_TYPE})")

    media_path = request.media_path
    output_path = request.output_path
    lyrics = request.lyrics
    force_alignment = request.force_alignment
    devanagari_output = request.devanagari_output

    if not os.path.isfile(media_path):
        return {"error": f"Media file not found: {media_path}"}

    _, ext = os.path.splitext(media_path)
    if ext.lower() not in [".mp4", ".mp3", ".wav"]:
        return {"error": "Unsupported format. Use .mp4, .mp3, or .wav"}

    if force_alignment and not lyrics.strip():
        return {"error": "force_alignment is enabled but no lyrics were provided. Please supply lyrics to align against."}

    start_time = time.time()
    audio = whisperx.load_audio(media_path)

    if force_alignment and lyrics:
        full_text = []
        for line in lyrics.splitlines():
            cleaned = re.sub(r'[^a-zA-Z\s]', '', line).strip()
            cleaned = re.sub(r'\s+', ' ', cleaned)
            if cleaned:
                full_text.append(cleaned)
        
        audio_duration = len(audio) / 16000.0
        segments = [{"text": " ".join(full_text), "start": 0.0, "end": audio_duration}]
        alignment_language = LANGUAGE
    else:
        print(f"[{time.strftime('%X')}] Transcribing audio...")
        model = whisperx.load_model(MODEL_NAME, DEVICE, compute_type=COMPUTE_TYPE)
        
        transcribe_result = model.transcribe(audio)
        segments = transcribe_result["segments"]
        detected_language = transcribe_result["language"]
        
        # New Transliteration Block
        if not devanagari_output and detected_language == "hi":  
            print(f"[{time.strftime('%X')}] Hindi detected. Transliterating to Latin script...")
            for segment in segments:
                segment["text"] = devanagari_to_latin(segment["text"])
            
            # CRITICAL: Force English alignment model to read the new Latin characters
            alignment_language = "en"
        else:
            alignment_language = detected_language

        print(f"[{time.strftime('%X')}] Releasing transcription model VRAM...")
        del model
        gc.collect()
        if DEVICE == "cuda":
            torch.cuda.empty_cache()

    print(f"[{time.strftime('%X')}] Aligning words...")
    model_a, metadata = whisperx.load_align_model(language_code=alignment_language, device=DEVICE)
    result = whisperx.align(segments, model_a, metadata, audio, DEVICE)

    print(f"[{time.strftime('%X')}] Releasing alignment model VRAM...")
    del model_a
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()

    # Format JSON
    audio_duration_ms = int(len(audio) / 16000.0 * 1000)

    sync_data = [{
        "text": "",
        "startMs": 0,
        "endMs": 0,
        "timestampMs": 0,
        "confidence": 1
    }]

    for segment in result["segments"]:
        if "words" in segment:
            for word in segment["words"]:
                if "start" in word and "end" in word:
                    start_ms = int(word["start"] * 1000)
                    sync_data.append({
                        "text": " " + word["word"],
                        "startMs": start_ms,
                        "endMs": int(word["end"] * 1000),
                        "timestampMs": start_ms,
                        "confidence": round(word.get("score", 0.0), 6)
                    })

    sync_data.append({
        "text": "",
        "startMs": audio_duration_ms,
        "endMs": audio_duration_ms,
        "timestampMs": audio_duration_ms,
        "confidence": 1
    })

    media_name = os.path.splitext(os.path.basename(media_path))[0] 
    output_path = output_path + media_name + ".json"
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(sync_data, f, indent=4, ensure_ascii=False)
    
    print(f"[{time.strftime('%X')}] Complete! Total time: {time.time() - start_time:.2f}s")

    return {"message": "Synchronization complete"}

"""
Which model to use.
| Model            | Disk   | Mem      |
|------------------|--------|----------|
| tiny             | 75 MB  | ~390 MB  |
| tiny.en          | 75 MB  | ~390 MB  |
| base             | 142 MB | ~500 MB  |
| base.en          | 142 MB | ~500 MB  |
| small            | 466 MB | ~1.0 GB  |
| small.en         | 466 MB | ~1.0 GB  |
| medium           | 1.5 GB | ~2.6 GB  |
| medium.en        | 1.5 GB | ~2.6 GB  |
| large-v1         | 2.9 GB | ~4.7 GB  |
| large-v2         | 2.9 GB | ~4.7 GB  |
| large-v3         | 2.9 GB | ~4.7 GB  |
| large-v3-turbo   | 1.5 GB | ~4.7 GB  | 
| large            | 2.9 GB | ~4.7 GB  |
"""
  
if __name__ == "__main__":
    # print("PyTorch version:", torch.__version__)
    # print("CUDA version:", torch.version.cuda)
    # print("CUDA available:", torch.cuda.is_available())
    # print("Device name:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "No GPU detected")

    # current_path  = os.path.dirname(os.path.abspath(__file__))

    # lyrics_path = current_path + r"\lyrics.txt"  # Replace with your lyrics file path
    # lyrics = ""

    # with open(lyrics_path, "r", encoding="utf-8") as f:
    #     lyrics = f.read()

    # sync_lyrics(
    #     media_path = current_path + r"\song.mp3",                  # Replace with your media file path
    #     lyrics = lyrics,                                                   
    #     force_alignment = False,                                             # Set to True to force alignment using provided lyrics
    #     devanagari_output = False,                                           # Set to True if you want to keep Hindi output in Devanagari script (only applies if Hindi is detected)
    #     output_path = current_path + r"\sync.json"                         # Replace with desired output path for sync.json
    # )

    # print("Synchronization complete. Check the output JSON file for results.")

    import uvicorn
    uvicorn.run("lyrics_synchronization:app", host="0.0.0.0", port=5001, reload=True)