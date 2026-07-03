import json
import boto3
from botocore.exceptions import ClientError


def get_secret(secret_name: str, region_name: str):
    """
    Fetch a secret from AWS Secrets Manager.
    Returns the secret as a Python dictionary.
    """

    client = boto3.client(
        "secretsmanager",
        region_name=region_name
    )

    try:
        response = client.get_secret_value(
            SecretId=secret_name
        )

        return json.loads(response["SecretString"])

    except ClientError as e:
        raise Exception(f"Unable to retrieve secret: {e}")
