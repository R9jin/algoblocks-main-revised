# api/limiter.py
from fastapi import Request
from slowapi import Limiter

def get_real_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

# Define it here so it can be imported anywhere without circular loops
limiter = Limiter(key_func=get_real_client_ip, default_limits=["100/minute"])