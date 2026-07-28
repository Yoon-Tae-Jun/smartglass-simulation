
# 텍스트를 벡터로 바꿔서 DB에 넣기 (Embedding)
# 서버 코드와는 별개로, 클라우드 DB에 60개의 여행 데이터를 최초 1회 밀어 넣기 위한 독립 실행용 스크립트

import json
import os
from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings

# 1. .env 파일에 숨겨둔 DB 접속 정보 로드
load_dotenv()

# Ollama 연동 우회를 위한 가짜 키
os.environ["OPENAI_API_KEY"] = "ollama"

# 2. .env에서 값 가져오기
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

CONNECTION_STRING = f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
COLLECTION_NAME = "seoul_travel_docs"


def load_json_data(file_path: str):
    """JSON 파일을 파이썬으로 읽어오는 함수"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def upload_data_to_ncp():
    """데이터를 벡터로 변환하여 NCP DB 서버에 업로드하는 함수"""
    # 스크립트 위치 기준으로 rag/seoul_travel_data.json 경로 정확히 잡기
    current_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(current_dir, "seoul_travel_data.json")

    try:
        raw_data = load_json_data(json_path)
    except FileNotFoundError:
        print(f"❌ 오류: '{json_path}' 경로에서 파일을 찾을 수 없습니다.")
        return

    documents = []

    # 1. JSON 데이터를 LangChain 문서 규격으로 조립
    for item in raw_data:
        text_content = f"[{item['category']}] {item['title']}\n키워드: {', '.join(item['keywords'])}\n내용: {item['content']}"

        metadata = {
            "id": item["id"],
            "title": item["title"],
            "location": item["location"]
        }

        doc = Document(page_content=text_content, metadata=metadata)
        documents.append(doc)

    print(f"총 {len(documents)}개의 장소 데이터를 로드했습니다.")
    print("NCP Vector DB 서버에 접속 및 임베딩을 시작합니다... (시간이 조금 걸릴 수 있습니다)")

    # 2. 무료 오픈소스 로컬 임베딩 모델 세팅 (rag_service.py와 동일한 모델 사용)
    embeddings = HuggingFaceEmbeddings(model_name="jhgan/ko-sroberta-multitask")

    # 3. NCP PostgreSQL(pgvector) 연동 라이브러리 임포트
    from langchain_postgres.vectorstores import PGVector

    # 4. DB 연결 및 데이터 밀어넣기(Insert)
    try:
        vectorstore = PGVector(
            embeddings=embeddings,
            collection_name=COLLECTION_NAME,
            connection=CONNECTION_STRING,
            use_jsonb=True,
        )

        # 실제 데이터 업로드 실행
        vectorstore.add_documents(documents)
        print(f"✅ 성공: NCP Vector DB 서버({DB_HOST})에 데이터 적재가 완벽하게 끝났습니다!")

    except Exception as e:
        print(f"❌ DB 접속 또는 데이터 업로드 실패: {e}")
        print(" 방화벽(ACG) 설정이 열려있는지, 접속 정보가 맞는지 다시 확인해 보세요.")


if __name__ == "__main__":
    upload_data_to_ncp()
