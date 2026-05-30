from abc import ABC, abstractmethod


class BaseAuthProvider(ABC):
    """
    Contract every auth provider must satisfy.
    Initialise with whatever credentials the provider needs,
    then call validate() to check them.

    Current:  PasswordAuth(plain, hashed)
    Future:   GoogleAuth(id_token)
              FacebookAuth(access_token)
              LinkedInAuth(code)
    """

    @abstractmethod
    def validate(self) -> bool:
        pass
