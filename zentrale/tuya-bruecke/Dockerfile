FROM python:3.12-alpine
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY bruecke.py ./
ENV PYTHONUNBUFFERED=1
CMD ["python", "bruecke.py"]
