"""공공데이터 CSV(data/raw) → 앱용 data/subway.json

    python tools/build_data.py

- 노선별 역 순서·이웃 역: 서울교통공사 역간거리 (1~8호선) + 9호선은 아래 목록
- 화장실: 서울교통공사 역사공중화장실정보 (1~8호선), 9호선 2·3단계 화장실정보
"""
import csv, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

LINES = {  # 칸 수, 노선색
    "1": (10, "#0052A4"), "2": (10, "#00A84D"), "3": (10, "#EF7C1C"), "4": (10, "#00A5DE"),
    "5": (8, "#996CAC"), "6": (8, "#CD7C2F"), "7": (8, "#747F00"), "8": (6, "#E6186C"), "9": (6, "#BDB092"),
}
LINE9 = ["개화", "김포공항", "공항시장", "신방화", "마곡나루", "양천향교", "가양", "증미", "등촌", "염창",
         "신목동", "선유도", "당산", "국회의사당", "여의도", "샛강", "노량진", "노들", "흑석", "동작",
         "구반포", "신반포", "고속터미널", "사평", "신논현", "언주", "선정릉", "삼성중앙", "봉은사", "종합운동장",
         "삼전", "석촌고분", "석촌", "송파나루", "한성백제", "올림픽공원", "둔촌오륜", "중앙보훈병원"]
# 역간거리 파일은 지선을 한 줄로 이어 붙여 놓아서, 실제와 다른 연결은 끊고 지선 분기점에 다시 붙임
REMOVE = {("2", "시청", "용답"), ("2", "신설동", "도림천"), ("5", "하남검단산", "둔촌동")}
ADD = [("2", "성수", "용답"), ("2", "신도림", "도림천"), ("5", "강동", "둔촌동")]


def read(name):
    with open(RAW / name, encoding="utf-8") as f:
        return [{(k or "").strip(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


ALIAS = {"뚝섬유원지": "자양"}   # 역 이름이 바뀐 곳 (화장실 데이터는 옛 이름)
DISPLAY = {"신내역": "신내"}


def norm(name):
    """역 이름 비교용: 괄호 제거, 끝의 '역' 제거 (서울역 → 서울)"""
    n = re.sub(r"\(.*?\)", "", name).strip()
    n = n[:-1] if n.endswith("역") and len(n) >= 3 else n
    return ALIAS.get(n, n)


seqs = {}
for r in read("역간거리_서울교통공사_240810.csv"):
    seqs.setdefault(r["호선"], []).append(DISPLAY.get(r["역명"], r["역명"]))
seqs["9"] = LINE9

lines = {}
for line, (cars, color) in LINES.items():
    seq = seqs[line]
    stations = list(dict.fromkeys(seq))
    edges = set()
    for a, b in zip(seq, seq[1:]):
        if a != b and (line, a, b) not in REMOVE:
            edges.add(tuple(sorted((a, b))))
    for l, a, b in ADD:
        if l == line:
            edges.add(tuple(sorted((a, b))))
    neighbors = {s: [] for s in stations}
    for a, b in sorted(edges):
        neighbors[a].append(b)
        neighbors[b].append(a)
    # 이웃 순서는 노선 순서대로
    order = {s: i for i, s in enumerate(stations)}
    for s in neighbors:
        neighbors[s].sort(key=order.get)
    lines[line] = {"cars": cars, "color": color, "stations": stations, "neighbors": neighbors}

toilets = {}
for r in read("화장실_서울교통공사_1-8호선_20260212.csv"):
    if not r["역명"]:
        continue
    toilets.setdefault(norm(r["역명"]), []).append({
        "line": r["운영노선명"].replace("호선", ""),
        "floor": ("지하" if r["지상 또는 지하 구분"] == "지하" else "지상") + r["역층"] + "층",
        "gate": r["게이트 내외 구분"],
        "exit": r["(근접) 출입구 번호"],
        "detail": r["상세위치"],
        "male": int(r["남성용-대변기수"] or 0),
        "female": int(r["여성용-대변기수"] or 0),
    })
for r in read("화장실_서울교통공사_9호선2-3단계_20260131.csv"):
    toilets.setdefault(norm(r["화장실명(역명)"]), []).append({
        "line": "9",
        "floor": ("지하" if r["지상-지하 구분"] == "지하" else "지상") + r["역층"] + "층",
        "gate": r["화장실 상세위치(게이트 내외부)"],
        "exit": r["근접출입구"],
        "detail": r["화장실 상세위치"],
        "male": int(r["남성용-대변기수"] or 0),
        "female": int(r["여성용-대변기수"] or 0),
    })

out = {
    "source": "서울교통공사 역간거리(2024-08-10), 역사공중화장실정보(2026-02-12), 9호선2·3단계 화장실정보(2026-01-31). 공공누리 1유형",
    "lines": lines,
    "toilets": toilets,
}
(ROOT / "data" / "subway.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

all_names = {norm(s) for l in lines.values() for s in l["stations"]}
print("역:", sum(len(l["stations"]) for l in lines.values()), "화장실 있는 역:", len(toilets),
      "역 목록에 없는 화장실 역:", sorted(set(toilets) - all_names))
for line, l in lines.items():
    odd = [s for s, n in l["neighbors"].items() if len(n) != 2]
    print(line, len(l["stations"]), "이웃이 2개가 아닌 역:", [(s, l["neighbors"][s]) for s in odd])
