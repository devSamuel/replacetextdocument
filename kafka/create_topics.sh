#!/bin/bash
set -e

BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-broker1:9092}"
RETRIES=30

echo "Waiting for Kafka brokers at $BOOTSTRAP ..."
for i in $(seq 1 $RETRIES); do
  if kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --list > /dev/null 2>&1; then
    echo "Kafka is ready"
    break
  fi
  echo "Attempt $i/$RETRIES — not ready yet, retrying in 5s..."
  sleep 5
  if [ "$i" = "$RETRIES" ]; then
    echo "ERROR: Kafka did not become ready in time"
    exit 1
  fi
done

kafka-topics.sh --bootstrap-server "$BOOTSTRAP" \
  --create --if-not-exists \
  --topic incoming-orders \
  --partitions 4 \
  --replication-factor 3

kafka-topics.sh --bootstrap-server "$BOOTSTRAP" \
  --create --if-not-exists \
  --topic confirmed-orders \
  --partitions 4 \
  --replication-factor 3

echo "Topics created: incoming-orders, confirmed-orders"
