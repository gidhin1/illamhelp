FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY api-java/pom.xml api-java/pom.xml
COPY infra/db/migrations infra/db/migrations
COPY proto proto
RUN mvn -B -f api-java/pom.xml -DskipTests dependency:go-offline

COPY api-java api-java
RUN mvn -B -f api-java/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre AS api-runtime
WORKDIR /app
RUN useradd --system --uid 10001 --home-dir /app illamhelp && rm -f /usr/bin/pebble
EXPOSE 4000 9090

FROM api-runtime AS speech-base
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm64" ]; then \
      sed -i -E 's#http://(archive|security)\.ubuntu\.com/ubuntu/#https://ports.ubuntu.com/ubuntu-ports/#' \
        /etc/apt/sources.list.d/ubuntu.sources; \
    else \
      sed -i 's|http://|https://|' /etc/apt/sources.list.d/ubuntu.sources; \
    fi

FROM speech-base AS whisper-build
RUN apt-get -o Acquire::Retries=2 update && \
    apt-get -o Acquire::Retries=2 install -y --no-install-recommends cmake curl g++ make && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl -fsSL --retry 2 --max-time 180 \
      https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/v1.9.5 -o whisper.tar.gz && \
    echo 'ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720  whisper.tar.gz' | sha256sum -c - && \
    mkdir source && tar -xzf whisper.tar.gz --strip-components=1 -C source && \
    cmake -S source -B out -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
      -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DWHISPER_BUILD_TESTS=OFF && \
    cmake --build out --target whisper-cli --parallel 4
RUN curl -fsSL --retry 2 --max-time 180 \
      https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.bin -o ggml-tiny.bin && \
    curl -fsSL --retry 2 --max-time 60 \
      https://raw.githubusercontent.com/openai/whisper/6e3be77e1a105e59086e3e21ff5f609fd6fa89a5/LICENSE -o MODEL-LICENSE && \
    printf '%s\n' \
      'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21  ggml-tiny.bin' \
      'b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d  MODEL-LICENSE' \
      | sha256sum -c -

FROM speech-base AS speech-runtime
RUN apt-get -o Acquire::Retries=2 update && \
    apt-get -o Acquire::Retries=2 install -y --no-install-recommends \
      ffmpeg tesseract-ocr tesseract-ocr-eng tesseract-ocr-mal && \
    rm -rf /var/lib/apt/lists/*
RUN install -d -m 0755 /opt/illamhelp/whisper
COPY --from=whisper-build /build/out/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --chmod=0444 --from=whisper-build /build/ggml-tiny.bin /opt/illamhelp/whisper/ggml-tiny.bin
COPY --chmod=0444 --from=whisper-build /build/source/LICENSE /opt/illamhelp/whisper/WHISPER-CPP-LICENSE
COPY --chmod=0444 --from=whisper-build /build/MODEL-LICENSE /opt/illamhelp/whisper/MODEL-LICENSE
ENV VIDEO_WHISPER_EXECUTABLE=/usr/local/bin/whisper-cli \
    VIDEO_WHISPER_MODEL=/opt/illamhelp/whisper/ggml-tiny.bin \
    VIDEO_FFMPEG_EXECUTABLE=/usr/bin/ffmpeg \
    VIDEO_FFPROBE_EXECUTABLE=/usr/bin/ffprobe \
    PHOTO_OCR_EXECUTABLE=/usr/bin/tesseract

FROM speech-runtime AS speech
COPY --from=build /workspace/api-java/target/api-0.1.0.jar /app/api.jar
USER 10001
ENTRYPOINT ["java", "-jar", "/app/api.jar"]

FROM scratch AS visual-model
ADD --checksum=sha256:cd8c0a19566f199b5c64da402f1d6a9daf80d094fe6536befb060a2cc59449c2 https://huggingface.co/Falconsai/nsfw_image_detection/resolve/96cb0d0342c7afb80cab76ecc58b265fa44da256/config.json /model/config.json
ADD --checksum=sha256:a34861a24e781942424ad790b82bc99348404a2e64ea882de88c40905851698d https://huggingface.co/Falconsai/nsfw_image_detection/resolve/96cb0d0342c7afb80cab76ecc58b265fa44da256/preprocessor_config.json /model/preprocessor_config.json
ADD --checksum=sha256:97b2ce64ec146884b37f98ee7944ca4891aa72f6827dc0cb10684a1cbecd5830 https://huggingface.co/Falconsai/nsfw_image_detection/resolve/96cb0d0342c7afb80cab76ecc58b265fa44da256/model.safetensors /model/model.safetensors
ADD --checksum=sha256:cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30 https://www.apache.org/licenses/LICENSE-2.0.txt /model/LICENSE

FROM speech-runtime AS visual
RUN apt-get -o Acquire::Retries=2 update && \
    apt-get -o Acquire::Retries=2 install -y --no-install-recommends python3.14 python3.14-venv && \
    rm -rf /var/lib/apt/lists/* && \
    python3.14 -m venv /opt/illamhelp/visual-env && \
    install -d -m 0755 /opt/illamhelp/visual-model
COPY infra/docker/visual-requirements.txt /opt/illamhelp/visual-requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    /opt/illamhelp/visual-env/bin/pip install --only-binary=:all: \
      -r /opt/illamhelp/visual-requirements.txt && \
    /opt/illamhelp/visual-env/bin/pip check
COPY --from=visual-model --chmod=0444 /model/* /opt/illamhelp/visual-model/
COPY --chmod=0555 scripts/screen-explicit-image.py /usr/local/bin/screen-explicit-image
ENV PATH=/opt/illamhelp/visual-env/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    MEDIA_VISUAL_EXECUTABLE=/usr/local/bin/screen-explicit-image \
    MEDIA_VISUAL_MODEL_DIRECTORY=/opt/illamhelp/visual-model
LABEL com.illamhelp.visual-model="Falconsai/nsfw_image_detection@96cb0d0342c7afb80cab76ecc58b265fa44da256"
COPY --from=build /workspace/api-java/target/api-0.1.0.jar /app/api.jar
USER 10001
ENTRYPOINT ["java", "-jar", "/app/api.jar"]

FROM api-runtime AS standard
ARG INSTALL_PHOTO_OCR=false
RUN if [ "$INSTALL_PHOTO_OCR" = "true" ]; then \
      apt-get update && \
      apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-mal && \
      rm -rf /var/lib/apt/lists/*; \
    fi
ARG INSTALL_VIDEO_SCREENING=false
RUN if [ "$INSTALL_VIDEO_SCREENING" = "true" ]; then \
      apt-get update && \
      apt-get install -y --no-install-recommends ffmpeg && \
      rm -rf /var/lib/apt/lists/*; \
    fi
COPY --from=build /workspace/api-java/target/api-0.1.0.jar /app/api.jar
USER 10001
ENTRYPOINT ["java", "-jar", "/app/api.jar"]
