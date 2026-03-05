import streamlit as st
import pandas as pd
import time

st.title("マウス操作 特性調査アプリ")
st.write("下のエリア内でマウスを動かして、最後に『保存』を押してください。")

# マウス位置を記録するための空のリスト（セッション状態）
if 'mouse_log' not in st.session_state:
    st.session_state.mouse_log = []

# ※実際にはJavaScriptのイベントリスナーを埋め込むことで
# 高精度な(x, y, t)を取得します。

if st.button("計測終了・データダウンロード"):
    df = pd.DataFrame(st.session_state.mouse_log, columns=['t', 'x', 'y'])
    st.download_button("CSVを保存", df.to_csv(index=False), "my_mouse_data.csv")
