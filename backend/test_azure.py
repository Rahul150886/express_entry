import os, asyncio, sys
sys.path.insert(0, '.')

# Load .env manually
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

from openai import AsyncAzureOpenAI

async def test():
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "NOT SET")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "NOT SET")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")
    api_key = os.getenv("AZURE_OPENAI_API_KEY", "NOT SET")

    print(f"Endpoint:    {endpoint}")
    print(f"Deployment:  {deployment}")
    print(f"API Version: {api_version}")
    print(f"API Key:     {api_key[:8]}..." if api_key != "NOT SET" else "API Key: NOT SET")

    client = AsyncAzureOpenAI(
        api_key=api_key,
        azure_endpoint=endpoint,
        api_version=api_version
    )
    try:
        resp = await client.chat.completions.create(
            model=deployment,
            messages=[{"role": "user", "content": "Say hello"}],
            max_tokens=10
        )
        print(f"\nSUCCESS: {resp.choices[0].message.content}")
    except Exception as e:
        print(f"\nFAILED: {type(e).__name__}: {e}")

asyncio.run(test())
