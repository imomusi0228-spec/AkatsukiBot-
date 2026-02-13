# UPDATE LOG

## [1.4.1.1] - 2026-02-13
### 修正 (Fixed)
- サーバー起動時の `TypeError: argument handler must be a function` エラーを修正。
- ルートの読み込み時に型チェックを追加し、不正なハンドラーによるクラッシュを防止。
- ルーティングエラー発生時の調査を容易にするため、詳細なエラーログ出力を追加。
- `routes/misc.js` のエクスポート処理を整理。
