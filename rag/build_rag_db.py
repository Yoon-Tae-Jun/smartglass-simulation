# 텍스트를 벡터로 바꿔서 DB에 넣기 (Embedding)
# 서버 코드와는 별개로, 클라우드 DB에 60개의 여행 데이터를 최초 1회 밀어 넣기 위한 독립 실행용 스크립트

# pip install langchain langchain-openai langchain-postgres psycopg2-binary pgvector

import json
import os
from langchain_core.documents import Document

# =========================================================
# [TODO 1: 임베딩 모델 라이브러리 및 API 키 세팅]
# 텍스트를 숫자로 바꾸는 '임베딩 모델'의 키를 입력하세요.
# (나중에 모델이 정해지면 해당 모델의 임베딩 객체로 교체)
# =========================================================
from langchain_openai import OpenAIEmbeddings

os.environ["OPENAI_API_KEY"] = "여기에_발급받은_API_키를_입력하세요"

# =========================================================
# [TODO 2: 네이버 클라우드 Vector DB(PostgreSQL) 접속 정보]
# =========================================================
DB_USER = "팀원에게_받은_DB_아이디"  # 예: "postgres" 또는 "admin"
DB_PASSWORD = "팀원에게_받은_DB_비밀번호"  # 예: "cloud1234!"
DB_HOST = "팀원에게_받은_DB_접속주소"  # 예: "10.10.x.x" 또는 "xxx.ntruss.com"
DB_PORT = "5432"  # 기본 포트(보통 5432 사용)
DB_NAME = "팀원에게_받은_DB_이름"  # 예: "vectordb"

# 위 정보를 바탕으로 DB 접속 주소(URI)를 자동 생성합니다.
CONNECTION_STRING = f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# DB 안에 데이터를 저장할 '테이블(컬렉션)' 이름을 정합니다.
COLLECTION_NAME = "seoul_travel_docs"


def load_json_data(file_path: str):
    """JSON 파일을 파이썬으로 읽어오는 함수"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def upload_data_to_ncp():
    """데이터를 벡터로 변환하여 NCP DB 서버에 업로드하는 함수"""
    json_path = "seoul_travel_data.json"

    try:
        raw_data = load_json_data(json_path)
    except FileNotFoundError:
        print("❌ 오류: 'seoul_travel_data.json' 파일을 찾을 수 없습니다. 같은 폴더에 있는지 확인하세요.")
        return

    documents = []

    # 1. JSON 데이터를 LangChain 문서 규격으로 조립
    for item in raw_data:
        # 검색 정확도를 높이기 위해 키워드와 내용을 합침
        text_content = f"[{item['category']}] {item['title']}\n키워드: {', '.join(item['keywords'])}\n내용: {item['content']}"

        # 나중에 프론트엔드에 전달할 위치 정보 등을 메타데이터로 저장
        metadata = {
            "id": item["id"],
            "title": item["title"],
            "location": item["location"]
        }

        doc = Document(page_content=text_content, metadata=metadata)
        documents.append(doc)

    print(f"총 {len(documents)}개의 장소 데이터를 로드했습니다.")
    print("NCP Vector DB 서버에 접속 및 임베딩을 시작합니다... (시간이 조금 걸릴 수 있습니다)")

    # 2. 임베딩 모델 세팅 (텍스트 -> 숫자 변환기)
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

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