import uvicorn

if __name__ == "__main__":
    print("=================================================================")
    print("       VERITAS: Automated Accounts Payable Audit Gateway        ")
    print("=================================================================")
    print(" * Serving API & Web Gateway at: http://127.0.0.1:8000")
    print(" * Interactive API Docs at:       http://127.0.0.1:8000/docs")
    print("=================================================================")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
