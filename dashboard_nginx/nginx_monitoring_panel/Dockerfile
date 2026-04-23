FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV APP_HOST=0.0.0.0
ENV APP_PORT=5999
EXPOSE 5999

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5999", "app:app"]
