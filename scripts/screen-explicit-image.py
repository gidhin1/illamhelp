#!/usr/bin/env python3
"""Read one validated image from stdin and emit one score using the pinned local model."""

import hashlib
import io
import os
from pathlib import Path
import sys

MODEL_FILES = {
    "config.json": "cd8c0a19566f199b5c64da402f1d6a9daf80d094fe6536befb060a2cc59449c2",
    "preprocessor_config.json": "a34861a24e781942424ad790b82bc99348404a2e64ea882de88c40905851698d",
    "model.safetensors": "97b2ce64ec146884b37f98ee7944ca4891aa72f6827dc0cb10684a1cbecd5830",
}
MAX_BYTES = 4 * 1024 * 1024
MAX_DIMENSION = 960


def main():
    directory = Path(os.environ["MEDIA_VISUAL_MODEL_DIRECTORY"]).resolve()
    for filename, expected in MODEL_FILES.items():
        with (directory / filename).open("rb") as model_file:
            if hashlib.file_digest(model_file, "sha256").hexdigest() != expected:
                raise ValueError("Visual model checksum mismatch")

    data = sys.stdin.buffer.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Image size exceeds screening limits")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

    from PIL import Image
    import torch
    from transformers import ViTForImageClassification, ViTImageProcessorPil

    torch.set_num_threads(2)
    Image.MAX_IMAGE_PIXELS = MAX_DIMENSION**2
    with Image.open(io.BytesIO(data), formats=("PNG",)) as image:
        if max(image.size) > MAX_DIMENSION or image.mode != "RGB" or image.is_animated:
            raise ValueError("Expected a bounded RGB frame")
        processor = ViTImageProcessorPil.from_pretrained(directory, local_files_only=True)
        inputs = processor(images=image, return_tensors="pt")

    model = ViTForImageClassification.from_pretrained(directory, local_files_only=True, use_safetensors=True)
    model.eval()
    with torch.inference_mode():
        score = model(**inputs).logits.softmax(dim=-1)[0, 1].item()
    print(score)


if __name__ == "__main__":
    main()
