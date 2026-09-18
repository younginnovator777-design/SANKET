import duckdb

def query_canonical_duckdb(parquet_path: str):
    conn = duckdb.connect(database=':memory:')
    return conn.execute(f"SELECT txid, src_ip, fee FROM read_parquet('{parquet_path}')").fetchall()
