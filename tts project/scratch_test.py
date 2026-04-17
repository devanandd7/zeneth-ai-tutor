from kokoro import KPipeline
print("Loading pipeline...")
pipeline = KPipeline(lang_code='a')
print("Running pipeline...")
for _, _, audio in pipeline("Hello world", voice="af_heart", speed=1.0):
    print(type(audio))
