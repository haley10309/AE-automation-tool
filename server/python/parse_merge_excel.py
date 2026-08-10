"""
NASCA DRM이 걸린 xlsx 파일을 파싱하기 위한 스크립트.

openpyxl/pandas 등으로 직접 파일을 읽으면 NASCA DRM 때문에 열리지 않으므로,
xlwings(COM)로 실제 설치된 Excel 애플리케이션을 띄워서 연다.
해당 PC에 NASCA 플러그인이 설치돼 있으면 Excel이 파일을 여는 시점에
플러그인이 자동으로 복호화를 처리해준다 (일반 파일을 여는 것과 동일하게 동작).

주의:
- DRM 복호화 특성상 openpyxl 대비 오픈 속도가 느릴 수 있다.
- 드물게 NASCA 플러그인이 최초 인증/권한 팝업을 띄우는 경우가 있는데,
  이 스크립트는 headless(visible=False)로 실행되므로 그런 팝업이 뜨면
  스크립트가 멈춘 것처럼 보일 수 있다. 이 경우 최초 1회는 사용자가
  화면에 보이는 Excel로 해당 파일을 직접 열어 인증을 완료해둬야 한다.
"""
import sys
import json
import time
import xlwings as xw

MAX_ROWS = 3000  # 안전장치: 비정상적으로 큰 파일 방지
OPEN_RETRIES = 3       # NASCA 복호화 지연 대응 재시도 횟수
OPEN_RETRY_DELAY = 2   # 재시도 간 대기(초)


def norm(v):
    if v is None:
        return ""
    return str(v).strip()


def open_book_with_retry(app, path):
    """NASCA 복호화가 느리게 끝나 첫 오픈이 실패하는 경우를 대비한 재시도"""
    last_err = None
    for attempt in range(1, OPEN_RETRIES + 1):
        try:
            return app.books.open(path)
        except Exception as e:
            last_err = e
            if attempt < OPEN_RETRIES:
                time.sleep(OPEN_RETRY_DELAY)
    raise last_err


def unmerge_and_fill(sheet):
    """
    병합된 셀 해제 후, 병합되어 있던 영역의 값을 모든 셀에 다시 채워 넣는다.
    (카테고리/키 컬럼이 여러 행에 걸쳐 병합되어 있는 케이스 대응.
     NASCA DRM과는 무관한, 카피덱 엑셀의 일반적인 서식 이슈 대응 로직)
    """
    used = sheet.api.UsedRange
    n_rows = used.Rows.Count
    n_cols = used.Columns.Count

    seen_addrs = set()
    merge_areas = []

    for r in range(1, n_rows + 1):
        for c in range(1, n_cols + 1):
            cell = used.Cells(r, c)
            if cell.MergeCells:
                area = cell.MergeArea
                addr = area.Address
                if addr not in seen_addrs:
                    seen_addrs.add(addr)
                    merge_areas.append(area)

    for area in merge_areas:
        val = area.Cells(1, 1).Value
        area.UnMerge()
        area.Value = val


def read_grid(sheet):
    used = sheet.used_range.value
    if not used:
        raise ValueError("시트에 데이터가 없습니다.")
    if not isinstance(used, list):
        # 셀 1개짜리 시트
        used = [[used]]
    if used and not isinstance(used[0], list):
        used = [used]

    if len(used) > MAX_ROWS:
        used = used[:MAX_ROWS]

    grid = [[norm(cell) for cell in row] for row in used]
    return grid


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 2:
        print(json.dumps({
            "errorMsg": "Usage: python parse_merge_excel.py <input_excel_path>",
            "statusCode": 400,
        }, ensure_ascii=False))
        sys.exit(1)

    input_excel_path = sys.argv[1]

    app = xw.App(visible=False, add_book=False)
    app.display_alerts = False
    app.screen_updating = False
    wb = None

    try:
        wb = open_book_with_retry(app, input_excel_path)
        sht = wb.sheets[0]

        unmerge_and_fill(sht)
        grid = read_grid(sht)

        print(json.dumps({
            "grid": grid,
            "rowCount": len(grid),
            "colCount": max((len(r) for r in grid), default=0),
        }, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "errorMsg": str(e),
            "statusCode": 500,
        }, ensure_ascii=False))
        sys.exit(1)

    finally:
        if wb:
            try:
                wb.close()
            except Exception:
                pass
        try:
            app.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()