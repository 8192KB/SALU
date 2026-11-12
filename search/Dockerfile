FROM docker.elastic.co/elasticsearch/elasticsearch:8.15.0
# 한국어 낱말을 나누는 분석기. 기본 이미지에 없어 빌드할 때 넣음
RUN bin/elasticsearch-plugin install --batch analysis-nori
